"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  History,
  Loader2,
  Mail,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  UsersRound,
  UserX,
  X,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import {
  CLIENT_ACCESS_PROFILES,
  getClientAccessProfile,
  inferClientAccessProfile,
  type ClientAccessProfileId,
} from "@/lib/client-access-profiles";

type Team = {
  id: string;
  name: string;
  description?: string;
  channels: string[];
  isDefault?: boolean;
};
type Member = {
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
  team?: string;
  availability?: string;
  status?: string;
  allowedChannels?: string[];
  maxOpenChats?: number | null;
  accessProfile?: string;
  capabilities?: string[];
  presenceState?: string;
  lastSeenAt?: unknown;
};
type SettingsPayload = {
  settings?: { rules?: { inbox?: { defaultTeam?: string; teams?: Team[] } } };
  error?: string;
};
type UsersPayload = { items?: Member[]; error?: string };
type Channel = {
  id?: string;
  type?: string;
  displayName?: string;
  phoneNumber?: string;
  channelScope?: string;
  ownerUserId?: string;
  ownerUserName?: string;
  connectionStatus?: string;
  provider?: string;
  status?: string;
  isOfficial?: boolean;
};
type ChannelsPayload = { items?: Channel[]; error?: string };
type Performance = {
  ownerId?: string;
  ownerName?: string;
  activeChats?: number;
  pendingChats?: number;
  overdueChats?: number;
  handledChats?: number;
  wonLeads?: number;
  totalLeads?: number;
  avgFirstResponseMinutes?: number;
};
type AuditItem = {
  id: string;
  type?: string;
  actorName?: string;
  targetUserName?: string;
  replacementUserName?: string;
  changedFields?: string[];
  createdAt?: { _seconds?: number; seconds?: number };
};
type DraftPerson = {
  name: string;
  email: string;
  accessProfile: ClientAccessProfileId;
  maxOpenChats: string;
};

const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "messenger", label: "Messenger" },
  { id: "site_chat", label: "Chat do site" },
  { id: "site_form", label: "Formulários" },
] as const;

const CAPABILITY_OPTIONS = [
  { id: "view_metrics", label: "Ver métricas e resultados" },
  { id: "view_team_records", label: "Ver toda a operação da equipe" },
  { id: "respond_inbox", label: "Responder conversas" },
  { id: "edit_leads", label: "Editar clientes e oportunidades" },
  { id: "manage_pipeline", label: "Gerenciar o funil" },
  { id: "manage_commercial", label: "Gerenciar propostas e vendas" },
  { id: "manage_ai", label: "Configurar o Assistente Altum" },
  { id: "manage_automations", label: "Gerenciar automações" },
  { id: "manage_channels", label: "Gerenciar canais da empresa" },
  { id: "manage_personal_channel", label: "Conectar o próprio WhatsApp" },
  { id: "manage_users", label: "Gerenciar equipe e acessos" },
  { id: "manage_settings", label: "Gerenciar configurações" },
] as const;

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 80) || `time_${Date.now()}`;
const blankPerson = (): DraftPerson => ({
  name: "",
  email: "",
  accessProfile: "seller",
  maxOpenChats: "12",
});

type MemberPresence = "online" | "away" | "offline";

function toPresenceDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value) {
    const record = value as {
      _seconds?: number;
      seconds?: number;
      toDate?: () => Date;
    };
    if (typeof record.toDate === "function") return record.toDate();
    const seconds = Number(record._seconds ?? record.seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
}

function memberPresence(member: Member): MemberPresence {
  const lastSeenAt = toPresenceDate(member.lastSeenAt)?.getTime() || 0;
  const age = Date.now() - lastSeenAt;
  if (member.presenceState === "online" && age <= 90_000) return "online";
  if (member.presenceState !== "offline" && age <= 5 * 60_000) return "away";
  return "offline";
}

function presenceMeta(member: Member) {
  const presence = memberPresence(member);
  if (presence === "online")
    return { label: "Online agora", tone: "success" as const };
  if (presence === "away")
    return { label: "Ausente há pouco", tone: "warning" as const };
  const lastSeenAt = toPresenceDate(member.lastSeenAt);
  if (!lastSeenAt) return { label: "Offline", tone: "neutral" as const };
  const minutes = Math.max(
    1,
    Math.round((Date.now() - lastSeenAt.getTime()) / 60_000),
  );
  const label =
    minutes < 60
      ? `Visto há ${minutes} min`
      : minutes < 1_440
        ? `Visto há ${Math.round(minutes / 60)} h`
        : `Visto há ${Math.round(minutes / 1_440)} d`;
  return { label, tone: "neutral" as const };
}

function isSellerMember(member: Member) {
  return (
    member.status !== "blocked" &&
    inferClientAccessProfile(member).id === "seller"
  );
}

export default function ClienteTimesPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_settings");
  const canManageUsers = hasCapability("manage_users");
  const canDeleteMembers = [
    "client_owner",
    "agency_owner",
    "agency_admin",
  ].includes(tenant?.tenantRole || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [defaultTeam, setDefaultTeam] = useState("comercial");
  const [members, setMembers] = useState<Member[]>([]);
  const [savedMembers, setSavedMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [existingPickerOpen, setExistingPickerOpen] = useState(false);
  const [existingSearch, setExistingSearch] = useState("");
  const [existingSelected, setExistingSelected] = useState<string[]>([]);
  const [directorySearch, setDirectorySearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [personComposerOpen, setPersonComposerOpen] = useState(false);
  const [draftTeam, setDraftTeam] = useState({
    name: "",
    description: "",
    channels: ["whatsapp"],
  });
  const [draftPeople, setDraftPeople] = useState<DraftPerson[]>([
    blankPerson(),
  ]);
  const [composerSaving, setComposerSaving] = useState(false);
  const [personSaving, setPersonSaving] = useState(false);
  const [personDraft, setPersonDraft] = useState<
    DraftPerson & { team: string }
  >({ ...blankPerson(), team: "" });

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;
    try {
      setLoading(true);
      setError(null);
      const [settingsRes, usersRes, channelsRes, metricsRes, auditRes] =
        await Promise.all([
          authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
          authedFetch(`/api/tenant/${tenant.tenantId}/users`),
          authedFetch(`/api/tenant/${tenant.tenantId}/channels`),
          authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary`),
          canManageUsers
            ? authedFetch(`/api/tenant/${tenant.tenantId}/audit-log`)
            : Promise.resolve(null),
        ]);
      const settings = (await settingsRes.json()) as SettingsPayload;
      const users = (await usersRes.json()) as UsersPayload;
      const channelsPayload = (await channelsRes
        .json()
        .catch(() => ({}))) as ChannelsPayload;
      const metricsPayload = (await metricsRes.json().catch(() => ({}))) as {
        operations?: { teamPerformance?: Performance[] };
      };
      const auditPayload = auditRes
        ? ((await auditRes.json().catch(() => ({}))) as { items?: AuditItem[] })
        : {};
      if (!settingsRes.ok || !usersRes.ok)
        throw new Error(
          settings.error ||
            users.error ||
            "Não foi possível carregar a operação.",
        );
      const nextTeams = settings.settings?.rules?.inbox?.teams || [];
      const nextMembers = users.items || [];
      setTeams(nextTeams);
      setMembers(nextMembers);
      setSavedMembers(nextMembers);
      setChannels(channelsPayload.items || []);
      setPerformance(metricsPayload.operations?.teamPerformance || []);
      setAuditItems(auditPayload.items || []);
      setDefaultTeam(
        settings.settings?.rules?.inbox?.defaultTeam ||
          nextTeams.find((item) => item.isDefault)?.id ||
          "comercial",
      );
      setSelectedId((current) =>
        current && nextTeams.some((item) => item.id === current)
          ? current
          : nextTeams[0]?.id || null,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar a operação.",
      );
    } finally {
      setLoading(false);
    }
  }, [canManageUsers, tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!tenant?.tenantId) return;
    let cancelled = false;
    const refreshPresence = async () => {
      if (document.visibilityState !== "visible") return;
      const response = await authedFetch(
        `/api/tenant/${tenant.tenantId}/users`,
      ).catch(() => null);
      if (!response?.ok || cancelled) return;
      const payload = (await response.json().catch(() => ({}))) as UsersPayload;
      const presenceByUser = new Map(
        (payload.items || []).map((member) => [member.userId, member]),
      );
      const mergePresence = (current: Member[]) =>
        current.map((member) => {
          const fresh = presenceByUser.get(member.userId);
          return fresh
            ? {
                ...member,
                presenceState: fresh.presenceState,
                lastSeenAt: fresh.lastSeenAt,
              }
            : member;
        });
      setMembers(mergePresence);
      setSavedMembers(mergePresence);
    };
    const timer = window.setInterval(() => void refreshPresence(), 45_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshPresence();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tenant?.tenantId]);

  const selected = teams.find((team) => team.id === selectedId) || null;
  const selectedMembers = useMemo(
    () =>
      selected ? members.filter((member) => member.team === selected.id) : [],
    [members, selected],
  );
  const teamChannels = useMemo(
    () =>
      selected
        ? channels.filter((channel) =>
            selected.channels.includes(
              String(channel.type || "").toLowerCase(),
            ),
          )
        : [],
    [channels, selected],
  );
  const availablePeople = useMemo(() => {
    const query = existingSearch.trim().toLowerCase();
    return members.filter(
      (member) =>
        member.role !== "client_owner" &&
        member.userId &&
        member.team !== selected?.id &&
        (!query ||
          `${member.name || ""} ${member.email || ""}`
            .toLowerCase()
            .includes(query)),
    );
  }, [existingSearch, members, selected]);
  const selectedPerformance = useMemo(
    () =>
      performance.filter((item) =>
        selectedMembers.some((member) => member.userId === item.ownerId),
      ),
    [performance, selectedMembers],
  );
  const stats = useMemo(
    () => ({
      active: members.filter((member) => member.status !== "blocked").length,
      online: members.filter(
        (member) =>
          member.status !== "blocked" && memberPresence(member) === "online",
      ).length,
      capacity: members.reduce(
        (sum, member) => sum + Number(member.maxOpenChats || 0),
        0,
      ),
      withoutTeam: members.filter(
        (member) => !member.team && member.role !== "client_owner",
      ).length,
    }),
    [members],
  );
  const missingTeams = useMemo(() => {
    const configured = new Set(teams.map((team) => team.id));
    return Array.from(
      new Set(
        members
          .map((member) => String(member.team || "").trim())
          .filter(Boolean),
      ),
    ).filter((item) => !configured.has(item));
  }, [members, teams]);

  function toggle(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }
  function changeTeam(patch: Partial<Team>) {
    if (selected)
      setTeams((current) =>
        current.map((team) =>
          team.id === selected.id ? { ...team, ...patch } : team,
        ),
      );
  }
  function changeMember(index: number, patch: Partial<Member>) {
    setMembers((current) =>
      current.map((member, i) =>
        i === index ? { ...member, ...patch } : member,
      ),
    );
  }

  async function saveTeams(event?: FormEvent) {
    event?.preventDefault();
    if (!tenant?.tenantId || !canManage) return;
    if (!teams.length || teams.some((team) => !team.name.trim())) {
      setError("Defina pelo menos um time com nome.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const normalized = teams.map((team) => ({
        ...team,
        id: slug(team.id || team.name),
        name: team.name.trim(),
        description: String(team.description || "").trim(),
        channels: Array.from(new Set(team.channels || [])),
      }));
      const chosen = normalized.some((team) => team.id === slug(defaultTeam))
        ? slug(defaultTeam)
        : normalized[0].id;
      const payload = normalized.map((team) => ({
        ...team,
        isDefault: team.id === chosen,
      }));
      const response = await authedFetch(
        `/api/tenant/${tenant.tenantId}/settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rules: { inbox: { defaultTeam: chosen, teams: payload } },
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Não foi possível salvar os times.");
      setTeams(payload);
      setDefaultTeam(chosen);
      setNotice("Estrutura dos times atualizada.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar os times.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveMember(member: Member) {
    if (
      !tenant?.tenantId ||
      !canManageUsers ||
      !member.userId ||
      member.role === "client_owner"
    )
      return;
    const before = savedMembers.find((item) => item.userId === member.userId);
    const keys = (
      [
        "team",
        "availability",
        "status",
        "allowedChannels",
        "maxOpenChats",
        "role",
        "accessProfile",
        "capabilities",
      ] as const
    ).filter(
      (key) => JSON.stringify(member[key]) !== JSON.stringify(before?.[key]),
    );
    if (!keys.length) return;
    const response = await authedFetch(
      `/api/tenant/${tenant.tenantId}/users/${encodeURIComponent(member.userId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(
            keys.map((key) => [
              key,
              member[key] ?? (key === "team" ? "" : null),
            ]),
          ),
        ),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || "Não foi possível salvar a pessoa.");
    setSavedMembers((current) =>
      current.map((item) => (item.userId === member.userId ? member : item)),
    );
  }

  async function removeMemberFromTeam(member: Member) {
    if (!member.userId || member.role === "client_owner") return;
    const updated = { ...member, team: "" };
    setMembers((current) =>
      current.map((item) =>
        item.userId === member.userId ? updated : item,
      ),
    );
    try {
      await saveMember(updated);
      setNotice(
        `${member.name || member.email || "Pessoa"} removido(a) do time. O acesso à empresa foi mantido.`,
      );
    } catch (error) {
      const previous = savedMembers.find(
        (item) => item.userId === member.userId,
      );
      if (previous) {
        setMembers((current) =>
          current.map((item) =>
            item.userId === member.userId ? previous : item,
          ),
        );
      }
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível remover a pessoa do time.",
      );
    }
  }

  async function offboardMember(
    member: Member,
    replacementUserId: string,
    channelAction: "transfer" | "shared",
  ) {
    if (!tenant?.tenantId || !member.userId || !canManageUsers) return;
    const response = await authedFetch(
      `/api/tenant/${tenant.tenantId}/users/${encodeURIComponent(member.userId)}/offboard`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replacementUserId: replacementUserId || undefined,
          channelAction,
        }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      affected?: Record<string, number>;
    };
    if (!response.ok)
      throw new Error(body.error || "Não foi possível desligar a pessoa.");
    await loadData();
    const affected = Object.values(body.affected || {}).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    );
    setNotice(
      `Acesso desligado e ${affected} registro(s) tratados com segurança.`,
    );
  }

  async function deleteMember(
    member: Member,
    input: {
      confirmation: string;
      replacementUserId: string;
      channelAction: "transfer" | "shared";
    },
  ) {
    if (!tenant?.tenantId || !member.userId || !canDeleteMembers) return;
    const response = await authedFetch(
      `/api/tenant/${tenant.tenantId}/users/${encodeURIComponent(member.userId)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      affected?: Record<string, number>;
    };
    if (!response.ok)
      throw new Error(body.error || "Não foi possível excluir a pessoa.");
    await loadData();
    const affected = Object.values(body.affected || {}).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    );
    setNotice(
      `Pessoa excluída da empresa. ${affected} registro(s) foram transferidos ou liberados.`,
    );
  }

  async function savePersonalChannel(
    member: Member,
    input: {
      channelId?: string;
      displayName: string;
      phoneNumber: string;
      sessionId: string;
    },
  ) {
    if (!tenant?.tenantId || !member.userId || !canManageUsers)
      throw new Error("Sem permissão para vincular o canal.");
    const response = await authedFetch(
      `/api/tenant/${tenant.tenantId}/channels`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: input.channelId || undefined,
          type: "whatsapp",
          provider: "evolution",
          displayName: input.displayName,
          phoneNumber: input.phoneNumber,
          status: "active",
          channelScope: "personal",
          ownerUserId: member.userId,
          metadata: input.sessionId
            ? { sessionId: input.sessionId }
            : undefined,
        }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      channelId?: string;
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || "Não foi possível vincular o WhatsApp.");
    await loadData();
    return body.channelId || input.channelId || "";
  }

  async function generatePersonalChannelQr(channelId: string) {
    if (!tenant?.tenantId || !channelId)
      throw new Error("Salve o canal antes de gerar o QR.");
    const response = await authedFetch(
      `/api/tenant/${tenant.tenantId}/channels/${encodeURIComponent(channelId)}/whatsapp-session?action=qr`,
    );
    const body = (await response.json().catch(() => ({}))) as {
      qr?: string;
      message?: string;
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || "Não foi possível gerar o QR.");
    return { qr: body.qr || "", message: body.message || "" };
  }

  async function assignExistingPeople() {
    if (!selected || !existingSelected.length) return;
    try {
      setSaving(true);
      setError(null);
      const selectedPeople = members.filter(
        (member) => member.userId && existingSelected.includes(member.userId),
      );
      await Promise.all(
        selectedPeople.map((member) =>
          saveMember({ ...member, team: selected.id }),
        ),
      );
      setMembers((current) =>
        current.map((member) =>
          existingSelected.includes(String(member.userId))
            ? { ...member, team: selected.id }
            : member,
        ),
      );
      setExistingSelected([]);
      setExistingPickerOpen(false);
      setNotice(`${selectedPeople.length} pessoa(s) adicionada(s) ao time.`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível vincular as pessoas.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage || !canManageUsers) return;
    const name = draftTeam.name.trim();
    const people = draftPeople.filter(
      (person) => person.name.trim() || person.email.trim(),
    );
    if (!name) {
      setError("Dê um nome ao time antes de continuar.");
      return;
    }
    if (people.some((person) => !person.email.trim())) {
      setError("Informe o e-mail de cada pessoa adicionada.");
      return;
    }
    try {
      setComposerSaving(true);
      setError(null);
      setNotice(null);
      const id = slug(name);
      const nextTeams = [
        ...teams.filter((team) => team.id !== id),
        {
          id,
          name,
          description: draftTeam.description.trim(),
          channels: draftTeam.channels,
          isDefault: teams.length === 0,
        },
      ];
      const settingsResponse = await authedFetch(
        `/api/tenant/${tenant.tenantId}/settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rules: {
              inbox: {
                defaultTeam: teams.length ? defaultTeam : id,
                teams: nextTeams,
              },
            },
          }),
        },
      );
      const settingsBody = (await settingsResponse
        .json()
        .catch(() => ({}))) as { error?: string };
      if (!settingsResponse.ok)
        throw new Error(settingsBody.error || "Não foi possível criar o time.");
      const invites = await Promise.allSettled(
        people.map((person) => {
          const profile = getClientAccessProfile(person.accessProfile);
          return authedFetch(`/api/tenant/${tenant.tenantId}/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: person.name.trim(),
              email: person.email.trim(),
              team: id,
              role: profile.role,
              accessProfile: profile.id,
              availability: "online",
              allowedChannels: draftTeam.channels,
              maxOpenChats: Number(person.maxOpenChats || 0),
              capabilities: profile.capabilities,
            }),
          });
        }),
      );
      const failed = invites.filter(
        (item) => item.status === "rejected" || !item.value.ok,
      ).length;
      setComposerOpen(false);
      setDraftTeam({ name: "", description: "", channels: ["whatsapp"] });
      setDraftPeople([blankPerson()]);
      setSelectedId(id);
      await loadData();
      setNotice(
        failed
          ? `Time criado, mas ${failed} convite(s) precisam ser revisados.`
          : `Time criado com ${people.length} pessoa(s).`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível criar a operação.",
      );
    } finally {
      setComposerSaving(false);
    }
  }

  function removeSelectedTeam() {
    if (!selected) return;
    if (selectedMembers.length) {
      setError("Mova as pessoas deste time antes de removê-lo.");
      return;
    }
    if (selected.id === defaultTeam) {
      setError("Escolha outro time padrão antes de removê-lo.");
      return;
    }
    const remaining = teams.filter((team) => team.id !== selected.id);
    setTeams(remaining);
    setSelectedId(remaining[0]?.id || null);
  }

  async function invitePerson(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManageUsers) return;
    if (!personDraft.email.trim()) {
      setError("Informe o e-mail da pessoa.");
      return;
    }
    try {
      setPersonSaving(true);
      setError(null);
      setNotice(null);
      const profile = getClientAccessProfile(personDraft.accessProfile);
      const response = await authedFetch(
        `/api/tenant/${tenant.tenantId}/users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: personDraft.name.trim(),
            email: personDraft.email.trim(),
            team: personDraft.team,
            role: profile.role,
            accessProfile: profile.id,
            availability: "online",
            allowedChannels: ["whatsapp"],
            maxOpenChats: Number(personDraft.maxOpenChats || 0),
            capabilities: profile.capabilities,
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Não foi possível adicionar a pessoa.");
      setPersonComposerOpen(false);
      setPersonDraft({
        ...blankPerson(),
        team: selectedId || teams[0]?.id || "",
      });
      await loadData();
      setNotice("Pessoa adicionada e convite preparado.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível adicionar a pessoa.",
      );
    } finally {
      setPersonSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Equipe e acessos"
        subtitle="Gerencie times, pessoas, permissões e canais de trabalho em uma única página."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Pessoas ativas",
            value: stats.active,
            hint: "com acesso à operação",
          },
          {
            label: "Online agora",
            value: stats.online,
            hint: "presença real na plataforma",
          },
          {
            label: "Capacidade declarada",
            value: stats.capacity,
            hint: "conversas simultâneas",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-[var(--cliente-border)] bg-white p-4"
          >
            <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--cliente-card-text-soft)]">
              {item.label}
            </p>
            <p className="mt-2 text-3xl font-black text-[var(--cliente-card-text)]">
              {item.value}
            </p>
            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
              {item.hint}
            </p>
          </div>
        ))}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
            Central da equipe
          </p>
          <h2 className="mt-1 text-xl font-bold text-[var(--cliente-card-text)]">
            Times e pessoas no mesmo lugar
          </h2>
        </div>
        {canManage && canManageUsers && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/cliente/painel/configuracoes/canais"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              WhatsApps e canais
            </Link>
            <button
              type="button"
              onClick={() => {
                setPersonDraft({
                  ...blankPerson(),
                  team: selectedId || teams[0]?.id || "",
                });
                setPersonComposerOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
            >
              <UserPlus className="h-4 w-4" />
              Adicionar pessoa
            </button>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Adicionar time
            </button>
          </div>
        )}
      </div>
      <section className="grid gap-4 xl:grid-cols-[minmax(300px,.75fr)_minmax(0,1.25fr)]">
        <PanelCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[var(--cliente-card-text)]">
                Times
              </p>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                Escolha um time para administrar.
              </p>
            </div>
            <UsersRound className="h-5 w-5 text-indigo-600" />
          </div>
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {teams.map((team) => {
                const count = members.filter(
                  (member) => member.team === team.id,
                ).length;
                return (
                  <button
                    type="button"
                    key={team.id}
                    onClick={() => setSelectedId(team.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === team.id ? "border-indigo-300 bg-indigo-50 shadow-sm" : "border-[var(--cliente-border)] bg-white hover:bg-[var(--cliente-surface-muted)]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-[var(--cliente-card-text)]">
                          {team.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                          {team.description || "Sem objetivo definido"}
                        </p>
                      </div>
                      {team.id === defaultTeam && (
                        <StateBadge label="Padrão" tone="info" />
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StateBadge
                        label={`${count} ${count === 1 ? "pessoa" : "pessoas"}`}
                        tone="neutral"
                      />
                      {team.channels.slice(0, 3).map((channel) => (
                        <span
                          key={channel}
                          className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[var(--cliente-card-text-soft)]"
                        >
                          {CHANNELS.find((item) => item.id === channel)
                            ?.label || channel}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
              {!teams.length && (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800">
                  Crie o primeiro time para começar a distribuir conversas.
                </div>
              )}
            </div>
          )}
        </PanelCard>
        <PanelCard className="p-5">
          {selected ? (
            <form onSubmit={saveTeams} className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-indigo-600">
                    Time selecionado
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-[var(--cliente-card-text)]">
                    {selected.name}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                    Ajuste identidade, canais e pessoas sem sair desta tela.
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={removeSelectedTeam}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Nome do time"
                  value={selected.name}
                  disabled={!canManage}
                  onChange={(value) => changeTeam({ name: value })}
                />
                <Field
                  label="Objetivo"
                  value={selected.description || ""}
                  disabled={!canManage}
                  onChange={(value) => changeTeam({ description: value })}
                />
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">
                  Time padrão para novas conversas
                </span>
                <select
                  value={defaultTeam}
                  disabled={!canManage}
                  onChange={(event) => setDefaultTeam(event.target.value)}
                  className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Não definir</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="text-xs font-bold text-[var(--cliente-card-text-soft)]">
                  Canais atendidos
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CHANNELS.map((channel) => {
                    const active = selected.channels.includes(channel.id);
                    return (
                      <button
                        type="button"
                        key={channel.id}
                        disabled={!canManage}
                        onClick={() =>
                          changeTeam({
                            channels: toggle(selected.channels, channel.id),
                          })
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold ${active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-[var(--cliente-border)] bg-white text-[var(--cliente-card-text-soft)]"}`}
                      >
                        {active && <Check className="mr-1 inline h-3 w-3" />}
                        {channel.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-[var(--cliente-border)] pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-[var(--cliente-card-text)]">
                      Pessoas deste time
                    </p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                      Disponibilidade e capacidade de atendimento.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      {selectedMembers.length}
                    </span>
                    {canManageUsers && (
                      <button
                        type="button"
                        onClick={() => setExistingPickerOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Adicionar cadastrados
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {selectedMembers.map((member) => {
                    const index = members.findIndex(
                      (item) => item.userId === member.userId,
                    );
                    const locked =
                      !canManageUsers || member.role === "client_owner";
                    const presence = presenceMeta(member);
                    return (
                      <div
                        key={member.userId || member.email}
                        className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">
                              {member.name || "Sem nome"}
                            </p>
                            <p className="truncate text-xs text-[var(--cliente-card-text-soft)]">
                              {member.email}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <StateBadge
                              label={presence.label}
                              tone={presence.tone}
                            />
                            <StateBadge
                              label={
                                member.role === "client_owner"
                                  ? "Dono"
                                  : inferClientAccessProfile(member).label
                              }
                              tone="info"
                            />
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          <select
                            disabled={locked}
                            value={inferClientAccessProfile(member).id}
                            onChange={(event) => {
                              const profile = getClientAccessProfile(
                                event.target.value,
                              );
                              changeMember(index, {
                                accessProfile: profile.id,
                                role: profile.role,
                                capabilities: profile.capabilities,
                              });
                            }}
                            className="rounded-xl border border-[var(--cliente-border)] bg-white px-2.5 py-2 text-xs"
                          >
                            <option value="seller">Vendedor</option>
                            <option value="manager">Gestor</option>
                            <option value="support">Atendimento</option>
                            <option value="analyst">Analista</option>
                          </select>
                          <select
                            disabled={locked}
                            value={member.availability || "online"}
                            onChange={(event) =>
                              changeMember(index, {
                                availability: event.target.value,
                              })
                            }
                            className="rounded-xl border border-[var(--cliente-border)] bg-white px-2.5 py-2 text-xs"
                          >
                            <option value="online">Disponível</option>
                            <option value="busy">Ocupado</option>
                            <option value="offline">Fora da escala</option>
                          </select>
                          <input
                            disabled={locked}
                            type="number"
                            min={1}
                            max={200}
                            value={member.maxOpenChats ?? ""}
                            placeholder="Capacidade"
                            onChange={(event) =>
                              changeMember(index, {
                                maxOpenChats: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            className="rounded-xl border border-[var(--cliente-border)] bg-white px-2.5 py-2 text-xs"
                          />
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() =>
                              void saveMember(member)
                                .then(() => setNotice("Pessoa atualizada."))
                                .catch((e) =>
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : "Falha ao salvar pessoa.",
                                  ),
                                )
                            }
                            className="inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-white px-2.5 py-2 text-xs font-bold text-indigo-700"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Salvar
                          </button>
                        </div>
                        {!locked ? (
                          <button
                            type="button"
                            onClick={() => void removeMemberFromTeam(member)}
                            className="mt-2 text-xs font-bold text-red-600 hover:text-red-700"
                          >
                            Remover deste time
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {!selectedMembers.length && (
                    <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
                      Nenhuma pessoa vinculada a este time ainda.
                    </p>
                  )}
                </div>
              </div>
              <div className="grid gap-3 border-t border-[var(--cliente-border)] pt-5 sm:grid-cols-2">
                <div>
                  <p className="font-bold text-[var(--cliente-card-text)]">
                    Canais ligados
                  </p>
                  <div className="mt-2 space-y-2">
                    {teamChannels.length ? (
                      teamChannels.map((channel) => (
                        <div
                          key={channel.id || channel.displayName}
                          className="rounded-xl border border-[var(--cliente-border)] bg-white p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-[var(--cliente-card-text)]">
                              {channel.displayName ||
                                channel.phoneNumber ||
                                "Canal"}
                            </p>
                            <StateBadge
                              label={
                                channel.connectionStatus === "connected" ||
                                channel.connectionStatus === "ready"
                                  ? "Conectado"
                                  : "Revisar"
                              }
                              tone={
                                channel.connectionStatus === "connected" ||
                                channel.connectionStatus === "ready"
                                  ? "success"
                                  : "warning"
                              }
                            />
                          </div>
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                            {channel.phoneNumber || "Número não informado"} ·{" "}
                            {channel.channelScope === "personal"
                              ? channel.ownerUserName || "Uso pessoal"
                              : "Canal da empresa"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-3 text-xs text-[var(--cliente-card-text-soft)]">
                        Nenhum canal ligado a este time.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-[var(--cliente-card-text)]">
                      Desempenho do time
                    </p>
                    <Link
                      href="/cliente/painel/relatorios?section=sellers"
                      className="text-xs font-bold text-indigo-700"
                    >
                      Ver ranking completo
                    </Link>
                  </div>
                  <div className="mt-2 space-y-2">
                    {selectedPerformance.length ? (
                      selectedPerformance
                        .slice(0, 5)
                        .sort(
                          (a, b) =>
                            Number(b.wonLeads || 0) - Number(a.wonLeads || 0),
                        )
                        .map((item, index) => (
                          <div
                            key={item.ownerId || item.ownerName}
                            className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-white p-3"
                          >
                            <div>
                              <p className="text-xs font-bold text-[var(--cliente-card-text)]">
                                {index + 1}. {item.ownerName || "Vendedor"}
                              </p>
                              <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">
                                {item.handledChats || 0} atendimentos ·{" "}
                                {item.avgFirstResponseMinutes || 0} min de
                                resposta
                              </p>
                            </div>
                            <span className="text-xs font-black text-emerald-700">
                              {item.wonLeads || 0} vendas
                            </span>
                          </div>
                        ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-3 text-xs text-[var(--cliente-card-text-soft)]">
                        O ranking aparecerá quando houver atividade atribuída.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {canManage && (
                <div className="flex justify-end border-t border-[var(--cliente-border)] pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Salvando" : "Salvar time"}
                  </button>
                </div>
              )}
            </form>
          ) : (
            <EmptyState
              onCreate={() => setComposerOpen(true)}
              canCreate={canManage && canManageUsers}
            />
          )}
        </PanelCard>
      </section>
      <PeopleDirectory
        members={members}
        teams={teams}
        channels={channels}
        search={directorySearch}
        setSearch={setDirectorySearch}
        canManage={canManageUsers}
        canDelete={canDeleteMembers}
        onChange={changeMember}
        onSave={(member) =>
          void saveMember(member)
            .then(() => setNotice("Pessoa atualizada."))
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "Falha ao salvar pessoa.",
              ),
            )
        }
        onOffboard={offboardMember}
        onDelete={deleteMember}
        onSaveChannel={savePersonalChannel}
        onGenerateQr={generatePersonalChannelQr}
      />
      {selected && (
        <details className="rounded-2xl border border-[var(--cliente-border)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-[var(--cliente-card-text)]">
            Canais e desempenho do time{" "}
            <span className="ml-2 font-normal text-[var(--cliente-card-text-soft)]">
              informações de apoio
            </span>
          </summary>
          <div className="mt-4">
            <TeamInsights
              channels={teamChannels}
              performance={selectedPerformance}
            />
          </div>
        </details>
      )}
      {canManageUsers && <AuditTrail items={auditItems} />}
      {missingTeams.length || stats.withoutTeam ? (
        <PanelCard className="border-amber-200 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            Atenção à cobertura da operação
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {stats.withoutTeam
              ? `${stats.withoutTeam} pessoa(s) ainda estão sem time. `
              : ""}
            {missingTeams.length
              ? `Há referências de ${missingTeams.join(", ")} sem configuração formal.`
              : ""}
          </p>
        </PanelCard>
      ) : null}
      {existingPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
                  Pessoas cadastradas
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Adicionar ao time {selected?.name}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Selecione quem já possui acesso à empresa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExistingPickerOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              value={existingSearch}
              onChange={(event) => setExistingSearch(event.target.value)}
              placeholder="Buscar por nome ou e-mail"
              className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-300"
            />
            <div className="mt-3 space-y-2">
              {availablePeople.map((person) => (
                <label
                  key={person.userId}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-3 hover:bg-indigo-50"
                >
                  <input
                    type="checkbox"
                    checked={existingSelected.includes(String(person.userId))}
                    onChange={() =>
                      setExistingSelected((current) =>
                        current.includes(String(person.userId))
                          ? current.filter((id) => id !== person.userId)
                          : [...current, String(person.userId)],
                      )
                    }
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {person.name || "Sem nome"}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {person.email} ·{" "}
                      {person.team ? `Time atual: ${person.team}` : "Sem time"}
                    </span>
                  </span>
                  <StateBadge
                    label={inferClientAccessProfile(person).label}
                    tone="info"
                  />
                </label>
              ))}
              {!availablePeople.length && (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Nenhuma pessoa disponível para adicionar.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setExistingPickerOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!existingSelected.length || saving}
                onClick={() => void assignExistingPeople()}
                className="rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Adicionar selecionadas
              </button>
            </div>
          </div>
        </div>
      )}
      {personComposerOpen && (
        <PersonComposer
          draft={personDraft}
          setDraft={setPersonDraft}
          teams={teams}
          saving={personSaving}
          onClose={() => setPersonComposerOpen(false)}
          onSubmit={invitePerson}
        />
      )}
      {composerOpen && (
        <Composer
          draftTeam={draftTeam}
          setDraftTeam={setDraftTeam}
          people={draftPeople}
          setPeople={setDraftPeople}
          saving={composerSaving}
          onClose={() => setComposerOpen(false)}
          onSubmit={createWorkspace}
        />
      )}
    </div>
  );
}

function TeamInsights({
  channels,
  performance,
}: {
  channels: Channel[];
  performance: Performance[];
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <PanelCard className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-[var(--cliente-card-text)]">
              Canais ligados ao time
            </p>
            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
              Veja quais números a equipe pode usar.
            </p>
          </div>
          <Link
            href="/cliente/painel/configuracoes/canais"
            className="text-xs font-bold text-indigo-700"
          >
            Gerenciar canais
          </Link>
        </div>
        <div className="mt-4 space-y-2">
          {channels.length ? (
            channels.map((channel) => (
              <div
                key={channel.id || channel.displayName}
                className="rounded-xl border border-[var(--cliente-border)] bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[var(--cliente-card-text)]">
                    {channel.displayName || channel.phoneNumber || "Canal"}
                  </p>
                  <StateBadge
                    label={
                      channel.connectionStatus === "connected" ||
                      channel.connectionStatus === "ready"
                        ? "Conectado"
                        : "Revisar"
                    }
                    tone={
                      channel.connectionStatus === "connected" ||
                      channel.connectionStatus === "ready"
                        ? "success"
                        : "warning"
                    }
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                  {channel.phoneNumber || "Número não informado"} ·{" "}
                  {channel.channelScope === "personal"
                    ? channel.ownerUserName || "Uso pessoal"
                    : "Canal da empresa"}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-3 text-sm text-[var(--cliente-card-text-soft)]">
              Nenhum canal ligado a este time.
            </p>
          )}
        </div>
      </PanelCard>
      <PanelCard className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-[var(--cliente-card-text)]">
              Ranking do time
            </p>
            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
              Atividade e conversão dos vendedores.
            </p>
          </div>
          <Link
            href="/cliente/painel/relatorios?section=sellers"
            className="text-xs font-bold text-indigo-700"
          >
            Ranking completo
          </Link>
        </div>
        <div className="mt-4 space-y-2">
          {performance.length ? (
            performance
              .slice()
              .sort((a, b) => Number(b.wonLeads || 0) - Number(a.wonLeads || 0))
              .slice(0, 5)
              .map((item, index) => (
                <div
                  key={item.ownerId || item.ownerName}
                  className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-white p-3"
                >
                  <div>
                    <p className="text-sm font-bold text-[var(--cliente-card-text)]">
                      {index + 1}. {item.ownerName || "Vendedor"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                      {item.handledChats || 0} atendimentos ·{" "}
                      {item.avgFirstResponseMinutes || 0} min de resposta
                    </p>
                  </div>
                  <span className="text-xs font-black text-emerald-700">
                    {item.wonLeads || 0} vendas
                  </span>
                </div>
              ))
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-3 text-sm text-[var(--cliente-card-text-soft)]">
              O ranking aparecerá quando houver atividade atribuída.
            </p>
          )}
        </div>
      </PanelCard>
    </section>
  );
}

function PeopleDirectory({
  members,
  teams,
  channels,
  search,
  setSearch,
  canManage,
  canDelete,
  onChange,
  onSave,
  onOffboard,
  onDelete,
  onSaveChannel,
  onGenerateQr,
}: {
  members: Member[];
  teams: Team[];
  channels: Channel[];
  search: string;
  setSearch: (value: string) => void;
  canManage: boolean;
  canDelete: boolean;
  onChange: (index: number, patch: Partial<Member>) => void;
  onSave: (member: Member) => void;
  onOffboard: (
    member: Member,
    replacementUserId: string,
    channelAction: "transfer" | "shared",
  ) => Promise<void>;
  onDelete: (
    member: Member,
    input: {
      confirmation: string;
      replacementUserId: string;
      channelAction: "transfer" | "shared";
    },
  ) => Promise<void>;
  onSaveChannel: (
    member: Member,
    input: {
      channelId?: string;
      displayName: string;
      phoneNumber: string;
      sessionId: string;
    },
  ) => Promise<string>;
  onGenerateQr: (channelId: string) => Promise<{ qr: string; message: string }>;
}) {
  const visible = members.filter(
    (member) =>
      !search.trim() ||
      `${member.name || ""} ${member.email || ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selected =
    members.find(
      (member) =>
        String(member.userId || member.id || member.email) === selectedUserId,
    ) || null;
  const selectedIndex = selected
    ? members.findIndex((member) => member === selected)
    : -1;
  const selectedLocked = !canManage || selected?.role === "client_owner";
  const selectedPersonalChannel = selected?.userId
    ? channels.find(
        (channel) =>
          channel.type === "whatsapp" &&
          channel.channelScope === "personal" &&
          channel.ownerUserId === selected.userId,
      )
    : undefined;
  const [channelDraft, setChannelDraft] = useState({
    channelId: "",
    displayName: "WhatsApp pessoal",
    phoneNumber: "",
    sessionId: "",
  });
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [qr, setQr] = useState("");
  const [offboardOpen, setOffboardOpen] = useState(false);
  const [replacementUserId, setReplacementUserId] = useState("");
  const [channelAction, setChannelAction] = useState<"transfer" | "shared">(
    "shared",
  );
  const [offboardBusy, setOffboardBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setChannelDraft({
      channelId: selectedPersonalChannel?.id || "",
      displayName: selectedPersonalChannel?.displayName || "WhatsApp pessoal",
      phoneNumber: selectedPersonalChannel?.phoneNumber || "",
      sessionId: "",
    });
    setQr("");
    setChannelError("");
    setOffboardOpen(false);
    setDeleteOpen(false);
    setDeleteConfirmation("");
    setReplacementUserId("");
    setChannelAction("shared");
  }, [
    selectedUserId,
    selectedPersonalChannel?.id,
    selectedPersonalChannel?.displayName,
    selectedPersonalChannel?.phoneNumber,
  ]);

  function updateSelected(patch: Partial<Member>) {
    if (selectedIndex >= 0) onChange(selectedIndex, patch);
  }

  function changeSelectedProfile(profileId: string) {
    const profile = getClientAccessProfile(profileId);
    updateSelected({
      accessProfile: profile.id,
      role: profile.role,
      capabilities: [...profile.capabilities],
    });
  }

  function toggleSelectedChannel(channelId: string) {
    if (!selected) return;
    const current = selected.allowedChannels || [];
    updateSelected({
      allowedChannels: current.includes(channelId)
        ? current.filter((item) => item !== channelId)
        : [...current, channelId],
    });
  }

  function toggleSelectedCapability(capabilityId: string) {
    if (!selected) return;
    const current = selected.capabilities || [];
    updateSelected({
      capabilities: current.includes(capabilityId)
        ? current.filter((item) => item !== capabilityId)
        : [...current, capabilityId],
    });
  }

  async function handleSaveChannel() {
    if (!selected) return;
    try {
      setChannelBusy(true);
      setChannelError("");
      setQr("");
      const channelId = await onSaveChannel(selected, channelDraft);
      setChannelDraft((current) => ({ ...current, channelId }));
    } catch (error) {
      setChannelError(
        error instanceof Error ? error.message : "Falha ao salvar o WhatsApp.",
      );
    } finally {
      setChannelBusy(false);
    }
  }

  async function handleGenerateQr() {
    const channelId =
      channelDraft.channelId || selectedPersonalChannel?.id || "";
    try {
      setChannelBusy(true);
      setChannelError("");
      const result = await onGenerateQr(channelId);
      setQr(result.qr);
      if (!result.qr && result.message) setChannelError(result.message);
    } catch (error) {
      setChannelError(
        error instanceof Error ? error.message : "Falha ao gerar o QR.",
      );
    } finally {
      setChannelBusy(false);
    }
  }

  async function handleOffboard() {
    if (!selected) return;
    try {
      setOffboardBusy(true);
      setChannelError("");
      await onOffboard(selected, replacementUserId, channelAction);
      setSelectedUserId(null);
    } catch (error) {
      setChannelError(
        error instanceof Error ? error.message : "Falha ao desligar o acesso.",
      );
    } finally {
      setOffboardBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    try {
      setDeleteBusy(true);
      setChannelError("");
      await onDelete(selected, {
        confirmation: deleteConfirmation,
        replacementUserId,
        channelAction,
      });
      setSelectedUserId(null);
    } catch (error) {
      setChannelError(
        error instanceof Error ? error.message : "Falha ao excluir a pessoa.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <PanelCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-[var(--cliente-card-text)]">
              Pessoas da empresa
            </p>
            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
              Abra uma pessoa para gerenciar todo o acesso sem sair desta
              página.
            </p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pessoa"
            className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm outline-none sm:w-64"
          />
        </div>
        <div className="mt-4 space-y-2">
          {visible.map((member) => {
            const memberId = String(member.userId || member.id || member.email);
            const profile = inferClientAccessProfile(member);
            const memberTeam =
              teams.find((team) => team.id === member.team)?.name || "Sem time";
            const personalChannel = member.userId
              ? channels.find(
                  (channel) =>
                    channel.channelScope === "personal" &&
                    channel.ownerUserId === member.userId,
                )
              : undefined;
            const ready = Boolean(
              member.team &&
              member.accessProfile &&
              ((member.allowedChannels || []).includes("whatsapp")
                ? personalChannel?.connectionStatus === "ready" ||
                  personalChannel?.connectionStatus === "connected"
                : true),
            );
            const presence = presenceMeta(member);
            return (
              <button
                type="button"
                key={memberId}
                onClick={() => setSelectedUserId(memberId)}
                className="grid w-full gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40 sm:grid-cols-[minmax(0,1.4fr)_minmax(140px,.7fr)_minmax(140px,.7fr)_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold text-[var(--cliente-card-text)]">
                      {member.name || "Sem nome"}
                    </span>
                    <StateBadge label={presence.label} tone={presence.tone} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--cliente-card-text-soft)]">
                    {member.email || "Sem e-mail"}
                  </span>
                </span>
                <span className="text-xs text-[var(--cliente-card-text-muted)]">
                  {memberTeam}
                </span>
                <span className="text-xs text-[var(--cliente-card-text-muted)]">
                  {member.role === "client_owner"
                    ? "Dono da conta"
                    : profile.label}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${member.status === "blocked" ? "bg-red-50 text-red-700" : ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {member.status === "blocked"
                    ? "Acesso desligado"
                    : ready
                      ? "Pronto para operar"
                      : "Concluir ativação"}
                </span>
              </button>
            );
          })}
          {!visible.length ? (
            <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-5 text-sm text-[var(--cliente-card-text-soft)]">
              Nenhuma pessoa encontrada.
            </p>
          ) : null}
        </div>
      </PanelCard>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Gerenciar ${selected.name || selected.email || "pessoa"}`}
            className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
                  Pessoa e acesso
                </p>
                <h2 className="mt-1 truncate text-2xl font-bold text-slate-950">
                  {selected.name || "Sem nome"}
                </h2>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {selected.email || "Sem e-mail"}
                </p>
                <div className="mt-2">
                  <StateBadge
                    label={presenceMeta(selected).label}
                    tone={presenceMeta(selected).tone}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
                  <span>Time</span>
                  {selected.team && !selectedLocked ? (
                    <button
                      type="button"
                      onClick={() => updateSelected({ team: "" })}
                      className="font-bold text-red-600 hover:text-red-700"
                    >
                      Remover do time
                    </button>
                  ) : null}
                </span>
                <select
                  disabled={selectedLocked}
                  value={selected.team || ""}
                  onChange={(event) =>
                    updateSelected({ team: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
                >
                  <option value="">Sem time</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <span className="block text-[11px] font-normal text-slate-500">
                  Salvar aplica a alteração sem remover o acesso à empresa.
                </span>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-600">
                  Função e visão da operação
                </span>
                <select
                  disabled={selectedLocked}
                  value={inferClientAccessProfile(selected).id}
                  onChange={(event) =>
                    changeSelectedProfile(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
                >
                  {CLIENT_ACCESS_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-600">
                  Disponibilidade
                </span>
                <select
                  disabled={selectedLocked}
                  value={selected.availability || "online"}
                  onChange={(event) =>
                    updateSelected({ availability: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
                >
                  <option value="online">Disponível</option>
                  <option value="busy">Ocupado</option>
                  <option value="offline">Fora da escala</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-600">
                  Capacidade simultânea
                </span>
                <input
                  disabled={selectedLocked}
                  type="number"
                  min={1}
                  max={200}
                  value={selected.maxOpenChats ?? ""}
                  onChange={(event) =>
                    updateSelected({
                      maxOpenChats: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50"
                />
              </label>
            </div>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold text-slate-900">
                    Canais e WhatsApp desta pessoa
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Tipos de atendimento e número pessoal ficam vinculados aqui,
                    sem sair desta página.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {CHANNELS.map((channel) => {
                  const active = (selected.allowedChannels || []).includes(
                    channel.id,
                  );
                  return (
                    <button
                      type="button"
                      key={channel.id}
                      disabled={selectedLocked}
                      onClick={() => toggleSelectedChannel(channel.id)}
                      className={`rounded-full border px-3 py-2 text-xs font-bold ${active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}
                    >
                      {active ? (
                        <Check className="mr-1 inline h-3 w-3" />
                      ) : null}
                      {channel.label}
                    </button>
                  );
                })}
              </div>
              {!selectedLocked ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        WhatsApp pessoal
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Somente esta pessoa, o dono e gestores autorizados
                        poderão acessar as conversas.
                      </p>
                    </div>
                    <StateBadge
                      label={
                        selectedPersonalChannel?.connectionStatus === "ready" ||
                        selectedPersonalChannel?.connectionStatus ===
                          "connected"
                          ? "Conectado"
                          : selectedPersonalChannel
                            ? "Aguardando QR"
                            : "Não vinculado"
                      }
                      tone={
                        selectedPersonalChannel?.connectionStatus === "ready" ||
                        selectedPersonalChannel?.connectionStatus ===
                          "connected"
                          ? "success"
                          : "warning"
                      }
                    />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Field
                      label="Nome do canal"
                      value={channelDraft.displayName}
                      onChange={(value) =>
                        setChannelDraft((current) => ({
                          ...current,
                          displayName: value,
                        }))
                      }
                    />
                    <Field
                      label="Número"
                      value={channelDraft.phoneNumber}
                      onChange={(value) =>
                        setChannelDraft((current) => ({
                          ...current,
                          phoneNumber: value,
                        }))
                      }
                    />
                    <div className="md:col-span-2">
                      <Field
                        label="Identificação da sessão"
                        value={channelDraft.sessionId}
                        onChange={(value) =>
                          setChannelDraft((current) => ({
                            ...current,
                            sessionId: value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  {channelError ? (
                    <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                      {channelError}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        channelBusy ||
                        !channelDraft.displayName ||
                        !channelDraft.phoneNumber
                      }
                      onClick={() => void handleSaveChannel()}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {channelBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar vínculo
                    </button>
                    {channelDraft.channelId || selectedPersonalChannel?.id ? (
                      <button
                        type="button"
                        disabled={channelBusy}
                        onClick={() => void handleGenerateQr()}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2.5 text-xs font-bold text-emerald-800 disabled:opacity-50"
                      >
                        <QrCode className="h-4 w-4" />
                        Gerar QR
                      </button>
                    ) : null}
                  </div>
                  {qr ? (
                    <div className="mt-4 flex justify-center rounded-2xl border border-slate-200 bg-white p-3">
                      {qr.startsWith("data:image") || qr.startsWith("http") ? (
                        <Image
                          src={qr}
                          alt="QR code para conectar o WhatsApp"
                          width={224}
                          height={224}
                          unoptimized
                          className="h-56 w-56 object-contain"
                        />
                      ) : (
                        <pre className="max-w-full overflow-auto text-xs text-slate-700">
                          {qr}
                        </pre>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                Permissões detalhadas
              </summary>
              <p className="mt-1 text-xs text-slate-500">
                Use apenas quando o perfil padrão precisar de uma exceção.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {CAPABILITY_OPTIONS.map((capability) => (
                  <label
                    key={capability.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      disabled={selectedLocked}
                      checked={(selected.capabilities || []).includes(
                        capability.id,
                      )}
                      onChange={() => toggleSelectedCapability(capability.id)}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    {capability.label}
                  </label>
                ))}
              </div>
            </details>

            {offboardOpen && selected.status !== "blocked" ? (
              <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-red-900">
                      Desligar com continuidade da operação
                    </p>
                    <p className="mt-1 text-xs leading-5 text-red-700">
                      O acesso será revogado, a sessão será encerrada e a
                      carteira poderá ser transferida antes do bloqueio.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOffboardOpen(false)}
                    className="rounded-lg p-1 text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-red-900">
                      Transferir carteira para
                    </span>
                    <select
                      value={replacementUserId}
                      onChange={(event) =>
                        setReplacementUserId(event.target.value)
                      }
                      className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">Deixar sem responsável</option>
                      {members
                        .filter(
                          (member) =>
                            member.userId &&
                            member.userId !== selected.userId &&
                            isSellerMember(member),
                        )
                        .map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name || member.email}
                          </option>
                        ))}
                    </select>
                    <span className="block text-[11px] font-normal text-red-700">
                      A carteira comercial só pode ser transferida para vendedores ativos.
                    </span>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-red-900">
                      WhatsApp pessoal
                    </span>
                    <select
                      value={channelAction}
                      onChange={(event) =>
                        setChannelAction(
                          event.target.value === "shared"
                            ? "shared"
                            : "transfer",
                        )
                      }
                      className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="transfer" disabled={!replacementUserId}>
                        Transferir para a mesma pessoa
                      </option>
                      <option value="shared">
                        Converter em canal da empresa
                      </option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={offboardBusy}
                  onClick={() => void handleOffboard()}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {offboardBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserX className="h-4 w-4" />
                  )}
                  Confirmar desligamento
                </button>
              </section>
            ) : null}

            {deleteOpen ? (
              <section className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-red-950">
                      Excluir da empresa definitivamente
                    </p>
                    <p className="mt-1 text-xs leading-5 text-red-700">
                      A pessoa perde o vínculo com esta empresa. A conta global
                      não é apagada caso ela participe de outra empresa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    className="rounded-lg p-1 text-red-700"
                    aria-label="Fechar exclusão"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-red-900">
                      Transferir carteira para
                    </span>
                    <select
                      value={replacementUserId}
                      onChange={(event) =>
                        setReplacementUserId(event.target.value)
                      }
                      className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">Deixar registros sem responsável</option>
                      {members
                        .filter(
                          (member) =>
                            member.userId &&
                            member.userId !== selected.userId &&
                            isSellerMember(member),
                        )
                        .map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name || member.email}
                          </option>
                        ))}
                    </select>
                    <span className="block text-[11px] font-normal text-red-700">
                      A carteira comercial só pode ser transferida para vendedores ativos.
                    </span>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-red-900">
                      WhatsApp pessoal
                    </span>
                    <select
                      value={channelAction}
                      onChange={(event) =>
                        setChannelAction(
                          event.target.value === "transfer"
                            ? "transfer"
                            : "shared",
                        )
                      }
                      className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="shared">
                        Converter em canal da empresa
                      </option>
                      <option value="transfer" disabled={!replacementUserId}>
                        Transferir para a mesma pessoa
                      </option>
                    </select>
                  </label>
                </div>
                <label className="mt-3 block space-y-1.5">
                  <span className="text-xs font-bold text-red-900">
                    Confirme digitando {selected.email}
                  </span>
                  <input
                    value={deleteConfirmation}
                    onChange={(event) =>
                      setDeleteConfirmation(event.target.value)
                    }
                    className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm"
                    autoComplete="off"
                  />
                </label>
                {channelError ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-red-700"
                  >
                    {channelError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={
                    deleteBusy ||
                    deleteConfirmation.trim().toLowerCase() !==
                      String(selected.email || "")
                        .trim()
                        .toLowerCase()
                  }
                  onClick={() => void handleDelete()}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {deleteBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir da empresa
                </button>
              </section>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <div>
                {!selectedLocked && selected.status !== "blocked" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteOpen(false);
                      setOffboardOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50"
                  >
                    <UserX className="h-4 w-4" />
                    Desligar acesso
                  </button>
                ) : null}
                {!selectedLocked && selected.status === "blocked" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...selected, status: "active" };
                      updateSelected({ status: "active" });
                      onSave(next);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reativar acesso
                  </button>
                ) : null}
                {!selectedLocked && canDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOffboardOpen(false);
                      setDeleteOpen(true);
                      setChannelError("");
                    }}
                    className="ml-2 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-bold text-red-800 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir da empresa
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserId(null)}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={selectedLocked}
                  onClick={() => {
                    onSave(selected);
                    setSelectedUserId(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Salvar pessoa
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AuditTrail({ items }: { items: AuditItem[] }) {
  const labels: Record<string, string> = {
    tenant_user_offboard: "Pessoa desligada e carteira tratada",
    tenant_user_delete: "Pessoa excluída da empresa",
    tenant_user_reactivate: "Acesso reativado",
    tenant_user_update: "Cadastro ou permissões atualizados",
    tenant_channel_upsert: "Canal conectado ou atualizado",
    tenant_channel_delete: "Canal removido",
  };
  return (
    <details className="rounded-2xl border border-[var(--cliente-border)] bg-white p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[var(--cliente-card-text)]">
        <History className="h-4 w-4 text-indigo-600" />
        Histórico administrativo{" "}
        <span className="font-normal text-[var(--cliente-card-text-soft)]">
          {items.length} evento(s)
        </span>
      </summary>
      <div className="mt-4 space-y-2">
        {items.slice(0, 20).map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5"
          >
            <div>
              <p className="text-xs font-bold text-[var(--cliente-card-text)]">
                {labels[item.type || ""] ||
                  item.type ||
                  "Alteração administrativa"}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--cliente-card-text-soft)]">
                {item.targetUserName ? `${item.targetUserName} · ` : ""}
                {item.replacementUserName
                  ? `transferido para ${item.replacementUserName} · `
                  : ""}
                por {item.actorName || "Administrador"}
              </p>
            </div>
            {item.changedFields?.length ? (
              <span className="text-[11px] text-[var(--cliente-card-text-soft)]">
                {item.changedFields.join(", ")}
              </span>
            ) : null}
          </div>
        ))}
        {!items.length ? (
          <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
            As próximas alterações de equipe e canais aparecerão aqui.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function EmptyState({
  onCreate,
  canCreate,
}: {
  onCreate: () => void;
  canCreate: boolean;
}) {
  return (
    <div className="grid min-h-[420px] place-items-center text-center">
      <div>
        <UsersRound className="mx-auto h-10 w-10 text-indigo-300" />
        <h3 className="mt-3 text-lg font-bold text-[var(--cliente-card-text)]">
          Sua operação começa aqui
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--cliente-card-text-muted)]">
          Crie um time e convide as pessoas que vão atender seus clientes.
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Criar primeiro time
          </button>
        )}
      </div>
    </div>
  );
}

function PersonComposer({
  draft,
  setDraft,
  teams,
  saving,
  onClose,
  onSubmit,
}: {
  draft: DraftPerson & { team: string };
  setDraft: React.Dispatch<
    React.SetStateAction<DraftPerson & { team: string }>
  >;
  teams: Team[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
              Nova pessoa
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              Adicionar pessoa à operação
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Convide alguém e já defina o time e o nível de acesso.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Nome"
              value={draft.name}
              onChange={(value) =>
                setDraft((current) => ({ ...current, name: value }))
              }
            />
            <Field
              label="E-mail de acesso"
              value={draft.email}
              onChange={(value) =>
                setDraft((current) => ({ ...current, email: value }))
              }
            />
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600">Time</span>
            <select
              value={draft.team}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  team: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Sem time por enquanto</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Perfil</span>
              <select
                value={draft.accessProfile}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    accessProfile: event.target.value as ClientAccessProfileId,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="seller">Vendedor</option>
                <option value="manager">Gestor</option>
                <option value="support">Atendimento</option>
                <option value="analyst">Analista</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600">
                Capacidade de conversas
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={draft.maxOpenChats}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxOpenChats: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {saving ? "Adicionando" : "Adicionar pessoa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Composer({
  draftTeam,
  setDraftTeam,
  people,
  setPeople,
  saving,
  onClose,
  onSubmit,
}: {
  draftTeam: { name: string; description: string; channels: string[] };
  setDraftTeam: React.Dispatch<
    React.SetStateAction<{
      name: string;
      description: string;
      channels: string[];
    }>
  >;
  people: DraftPerson[];
  setPeople: React.Dispatch<React.SetStateAction<DraftPerson[]>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const update = (index: number, patch: Partial<DraftPerson>) =>
    setPeople((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
              Nova operação
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              Crie o time e convide as pessoas
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Tudo será salvo junto e cada convite já ficará ligado ao time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Nome do time"
              value={draftTeam.name}
              onChange={(value) =>
                setDraftTeam((current) => ({ ...current, name: value }))
              }
            />
            <Field
              label="Objetivo do time"
              value={draftTeam.description}
              onChange={(value) =>
                setDraftTeam((current) => ({ ...current, description: value }))
              }
            />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600">Canais da fila</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHANNELS.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  onClick={() =>
                    setDraftTeam((current) => ({
                      ...current,
                      channels: current.channels.includes(channel.id)
                        ? current.channels.filter((item) => item !== channel.id)
                        : [...current.channels, channel.id],
                    }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${draftTeam.channels.includes(channel.id) ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}
                >
                  {channel.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">Pessoas do time</p>
                <p className="mt-1 text-xs text-slate-500">
                  Adicione vendedores, gestores ou atendimento antes de
                  concluir.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPeople((current) => [...current, blankPerson()])
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                Adicionar pessoa
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {people.map((person, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field
                      label="Nome"
                      value={person.name}
                      onChange={(value) => update(index, { name: value })}
                    />
                    <Field
                      label="E-mail de acesso"
                      value={person.email}
                      onChange={(value) => update(index, { email: value })}
                    />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        Perfil
                      </span>
                      <select
                        value={person.accessProfile}
                        onChange={(event) =>
                          update(index, {
                            accessProfile: event.target
                              .value as ClientAccessProfileId,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs"
                      >
                        <option value="seller">Vendedor</option>
                        {CLIENT_ACCESS_PROFILES.filter((profile) =>
                          ["manager", "support", "analyst"].includes(
                            profile.id,
                          ),
                        ).map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        Capacidade
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={person.maxOpenChats}
                        onChange={(event) =>
                          update(index, { maxOpenChats: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs"
                      />
                    </label>
                    {people.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPeople((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                        className="self-end rounded-xl p-2 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {saving ? "Criando operação" : "Criar time e enviar convites"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">
        {label}
      </span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none placeholder:text-slate-400 focus:border-indigo-300 disabled:bg-[var(--cliente-surface-muted)] disabled:opacity-60"
      />
    </label>
  );
}
