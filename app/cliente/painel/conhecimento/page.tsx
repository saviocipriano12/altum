"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  LibraryBig,
  Loader2,
  PencilLine,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, EmptyState, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";
import { getBusinessProfile, type BusinessProfileId } from "@/lib/business-profiles";

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

type AiLog = {
  id: string;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  reason?: string;
  matchedKbDocIds?: string[];
  createdAt?: unknown;
};

type UsageRow = {
  id: string;
  type: KbDoc["type"];
  preview: string;
  total: number;
};

type TenantSettingsPayload = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

const EMPTY_FORM = {
  type: "faq" as KbDoc["type"],
  content: "",
  tags: "",
};

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Sem data";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(type: KbDoc["type"]) {
  if (type === "catalog") return "catalogo";
  if (type === "policy") return "politica";
  return "faq";
}

function typeTone(type: KbDoc["type"]) {
  if (type === "catalog") return "info" as const;
  if (type === "policy") return "warning" as const;
  return "success" as const;
}

function usageTone(total: number) {
  if (total >= 8) return "success" as const;
  if (total >= 3) return "info" as const;
  if (total >= 1) return "warning" as const;
  return "neutral" as const;
}

export default function ClienteConhecimentoPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFromQuery = searchParams.get("q") || "";
  const typeFromQuery = searchParams.get("type") || "all";
  const usageFromQuery = searchParams.get("usage") || "all";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchFromQuery);
  const [typeFilter, setTypeFilter] = useState<"all" | KbDoc["type"]>(
    typeFromQuery === "faq" || typeFromQuery === "catalog" || typeFromQuery === "policy" ? typeFromQuery : "all"
  );
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">(
    usageFromQuery === "used" || usageFromQuery === "unused" ? usageFromQuery : "all"
  );

  const canEdit = hasCapability("manage_ai");
  const canDelete = hasCapability("manage_ai");

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const [docsRes, logsRes, settingsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
      ]);

      const docsPayload = (await docsRes.json()) as { items?: KbDoc[]; error?: string };
      const logsPayload = (await logsRes.json()) as { items?: AiLog[]; error?: string };
      const settingsPayload = (await settingsRes.json().catch(() => ({}))) as TenantSettingsPayload;

      if (!docsRes.ok) throw new Error(docsPayload.error || "Falha ao carregar documentos.");
      if (!logsRes.ok) throw new Error(logsPayload.error || "Falha ao carregar logs da IA.");

      setDocs(docsPayload.items || []);
      setLogs(logsPayload.items || []);
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar base de conhecimento.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);

  useEffect(() => {
    if (searchFromQuery !== search) setSearch(searchFromQuery);
    const nextType =
      typeFromQuery === "faq" || typeFromQuery === "catalog" || typeFromQuery === "policy" ? typeFromQuery : "all";
    if (nextType !== typeFilter) setTypeFilter(nextType);
    const nextUsage = usageFromQuery === "used" || usageFromQuery === "unused" ? usageFromQuery : "all";
    if (nextUsage !== usageFilter) setUsageFilter(nextUsage);
  }, [search, searchFromQuery, typeFilter, typeFromQuery, usageFilter, usageFromQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (usageFilter !== "all") next.set("usage", usageFilter);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/conhecimento?${nextQuery}` : "/cliente/painel/conhecimento");
  }, [router, search, searchParams, typeFilter, usageFilter]);

  const usageMap = useMemo(() => {
    const next = new Map<string, number>();
    logs.forEach((log) => {
      (log.matchedKbDocIds || []).forEach((docId) => {
        next.set(docId, (next.get(docId) || 0) + 1);
      });
    });
    return next;
  }, [logs]);

  const usageRows = useMemo<UsageRow[]>(() => {
    return docs
      .map((doc) => ({
        id: doc.id,
        type: doc.type,
        preview: doc.content.slice(0, 88),
        total: usageMap.get(doc.id) || 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [docs, usageMap]);

  const filteredDocs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return docs.filter((doc) => {
      const totalUsage = usageMap.get(doc.id) || 0;
      if (typeFilter !== "all" && doc.type !== typeFilter) return false;
      if (usageFilter === "used" && totalUsage <= 0) return false;
      if (usageFilter === "unused" && totalUsage > 0) return false;
      if (
        normalizedSearch &&
        !`${doc.content} ${(doc.tags || []).join(" ")} ${doc.type}`.toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [docs, search, typeFilter, usageFilter, usageMap]);

  const stats = useMemo(() => {
    const used = usageRows.filter((item) => item.total > 0).length;
    const unused = usageRows.filter((item) => item.total === 0).length;
    const faq = docs.filter((doc) => doc.type === "faq").length;
    const policy = docs.filter((doc) => doc.type === "policy").length;
    const catalog = docs.filter((doc) => doc.type === "catalog").length;
    return {
      total: docs.length,
      used,
      unused,
      faq,
      policy,
      catalog,
    };
  }, [docs, usageRows]);

  const topReasons = useMemo(() => {
    return Array.from(
      logs
        .filter((log) => log.decision === "handoff")
        .reduce((acc, log) => {
          const key = String(log.reason || "sem motivo").trim() || "sem motivo";
          acc.set(key, (acc.get(key) || 0) + 1);
          return acc;
        }, new Map<string, number>())
    )
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [logs]);
  const topUsedDoc = usageRows[0] || null;
  const templates = useMemo(
    () => [
      {
        id: "faq_preco",
        type: "faq" as KbDoc["type"],
        title: `FAQ do modo ${businessProfile.label}`,
        content: `Pergunta: Como funciona o atendimento para ${businessProfile.label.toLowerCase()}?\nResposta: Explique que o fluxo foi desenhado para ${businessProfile.commercialMotion}, mantenha o tom ${businessProfile.ai.toneOfVoice} e colete o contexto necessario antes do proximo passo.`,
        tags: `faq, ${businessProfile.id}, comercial`,
      },
      {
        id: "catalog_servicos",
        type: "catalog" as KbDoc["type"],
        title: "Catalogo operacional do modo",
        content: `Estruture o catalogo com servicos, diferenciais, entregaveis, prazo medio, restricoes e criterios de fit para ${businessProfile.label.toLowerCase()}. Destaque tambem as metricas naturais: ${businessProfile.metrics.join(", ")}.`,
        tags: `catalogo, ${businessProfile.id}, proposta`,
      },
      {
        id: "policy_guardrail",
        type: "policy" as KbDoc["type"],
        title: "Politica comercial e guardrails",
        content: `Formalize politicas e excecoes para ${businessProfile.label.toLowerCase()}. Inclua os guardrails: ${businessProfile.ai.guardrails.join(" | ")}.`,
        tags: `politica, handoff, ${businessProfile.id}`,
      },
    ],
    [businessProfile]
  );

  async function submitDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenant?.tenantId || !canEdit) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const endpoint = editingDocId
        ? `/api/tenant/${tenant.tenantId}/kb-docs/${editingDocId}`
        : `/api/tenant/${tenant.tenantId}/kb-docs`;
      const method = editingDocId ? "PATCH" : "POST";

      const res = await authedFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          content: form.content,
          tags: form.tags,
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao salvar documento.");

      setForm(EMPTY_FORM);
      setEditingDocId(null);
      setSuccess(editingDocId ? "Documento atualizado." : "Documento criado.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar documento.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(docId: string) {
    if (!tenant?.tenantId || !canDelete) return;

    try {
      setBusyDocId(docId);
      setError(null);
      setSuccess(null);

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs/${docId}`, { method: "DELETE" });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao remover documento.");

      if (editingDocId === docId) {
        setEditingDocId(null);
        setForm(EMPTY_FORM);
      }
      setSuccess("Documento removido.");
      await loadData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao remover documento.");
    } finally {
      setBusyDocId(null);
    }
  }

  function startEdit(doc: KbDoc) {
    setEditingDocId(doc.id);
    setForm({
      type: doc.type,
      content: doc.content,
      tags: (doc.tags || []).join(", "),
    });
    setSuccess(null);
    setError(null);
  }

  function resetForm() {
    setEditingDocId(null);
    setForm(EMPTY_FORM);
  }

  function applyTemplate(template: { type: KbDoc["type"]; content: string; tags: string }) {
    setEditingDocId(null);
    setForm({
      type: template.type,
      content: template.content,
      tags: template.tags,
    });
    setSuccess(null);
    setError(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-white/60">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Base de conhecimento"
            subtitle="Documentos, playbooks e regras que orientam o agente comercial do tenant."
            action={<StateBadge label={`${stats.total} ativos`} tone={stats.total ? "info" : "neutral"} />}
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Documentos" value={String(stats.total)} icon={LibraryBig} trend="base carregada" />
            <MetricCard label="Em uso" value={String(stats.used)} icon={Sparkles} trend="acionados pela IA" />
            <MetricCard label="Sem uso" value={String(stats.unused)} icon={ShieldCheck} trend="pedem calibragem" />
            <MetricCard label="FAQ / catalogo / politica" value={`${stats.faq}/${stats.catalog}/${stats.policy}`} icon={BookOpen} trend="mix da base" />
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <CardTitle title="Orientacao rapida" subtitle="O que reforcar primeiro para o agente vender melhor." />
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-medium text-white">Cobertura util</p>
              <p className="mt-1 text-xs text-white/50">
                {stats.used
                  ? `${stats.used} documentos ja alimentam respostas reais da IA.`
                  : "A IA ainda nao reutilizou os documentos; vale revisar perguntas frequentes e scripts comerciais."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-medium text-white">Motivos de escalada</p>
              <p className="mt-1 text-xs text-white/50">
                {topReasons.length
                  ? `Principal gargalo: ${topReasons[0]?.reason || "sem motivo"}.`
                  : "Sem historico recente de handoffs para analisar."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-medium text-white">Recomendacao imediata</p>
              <p className="mt-1 text-xs text-white/50">
                Priorize catalogo e politicas quando a equipe estiver lidando com preco, escopo ou regras comerciais.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-medium text-white">Documento lider</p>
              <p className="mt-1 text-xs text-white/50">
                {topUsedDoc ? `${typeLabel(topUsedDoc.type)} com ${topUsedDoc.total} uso(s): ${topUsedDoc.preview}` : "Nenhum documento foi reutilizado pela IA ainda."}
              </p>
            </div>
          </div>
        </PanelCard>
      </section>

      <PanelCard className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle
            title={`Modo do negocio: ${businessProfile.label}`}
            subtitle="Use o perfil ativo para alimentar a base com contexto mais util para o agente e os handoffs."
          />
          <StateBadge label={businessProfile.id} tone="info" />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm font-medium text-white">Perguntas e contexto mais valiosos</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.ai.mandatoryQuestions.map((question) => (
                <StateBadge key={question} label={question} tone="neutral" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm font-medium text-white">Cobertura que mais ajuda este modo</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.crm.leadFields.map((field) => (
                <StateBadge key={field} label={field.replaceAll("_", " ")} tone="info" />
              ))}
            </div>
          </div>
        </div>
      </PanelCard>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader title="Biblioteca ativa" subtitle="Filtre, revise uso e edite playbooks sem sair da governanca da IA." />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="xl:col-span-2 flex items-center gap-2 rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-white/70">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar conteudo, tag ou tipo"
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
              />
            </label>

            <FilterSelect
              label="Tipo"
              value={typeFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "faq", label: "FAQ" },
                { value: "catalog", label: "Catalogo" },
                { value: "policy", label: "Politica" },
              ]}
              onChange={(value) => setTypeFilter(value as "all" | KbDoc["type"])}
            />
            <FilterSelect
              label="Uso"
              value={usageFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "used", label: "Em uso" },
                { value: "unused", label: "Sem uso" },
              ]}
              onChange={(value) => setUsageFilter(value as "all" | "used" | "unused")}
            />
          </div>

          <div className="mt-4 space-y-3">
            {filteredDocs.length ? (
              filteredDocs.map((doc) => {
                const totalUsage = usageMap.get(doc.id) || 0;
                return (
                  <article key={doc.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StateBadge label={typeLabel(doc.type)} tone={typeTone(doc.type)} />
                          <StateBadge label={`${totalUsage} usos`} tone={usageTone(totalUsage)} />
                          <StateBadge label={`atualizado ${formatDateTime(doc.updatedAt)}`} tone="neutral" />
                        </div>
                        <p className="mt-3 text-sm text-white/86">{doc.content}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(doc.tags || []).length ? (
                            doc.tags.map((tag) => <StateBadge key={`${doc.id}_${tag}`} label={tag} tone="neutral" />)
                          ) : (
                            <span className="text-xs text-white/42">sem tags</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => startEdit(doc)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/84 transition hover:bg-white/[0.08]"
                          >
                            <PencilLine className="h-4 w-4" />
                            Editar
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            disabled={busyDocId === doc.id}
                            onClick={() => void removeDoc(doc.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyDocId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState
                title="Nenhum documento encontrado"
                description="Ajuste os filtros ou cadastre um novo item para fortalecer o repertorio da IA."
              />
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5 md:p-6">
            <SectionHeader
              title={editingDocId ? "Editar documento" : "Novo documento"}
              subtitle="Cadastre conhecimento pronto para reutilizacao em respostas e qualificacao."
            />

            {error ? <p className="mb-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
            {success ? <p className="mb-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{success}</p> : null}

            {canEdit ? (
              <form className="space-y-3" onSubmit={submitDoc}>
                <FilterSelect
                  label="Tipo"
                  value={form.type}
                  options={[
                    { value: "faq", label: "FAQ" },
                    { value: "catalog", label: "Catalogo" },
                    { value: "policy", label: "Politica" },
                  ]}
                  onChange={(value) => setForm((current) => ({ ...current, type: value as KbDoc["type"] }))}
                />

                <label className="block text-xs uppercase tracking-[0.16em] text-white/45">
                  Conteudo
                  <textarea
                    value={form.content}
                    onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                    rows={7}
                    placeholder="Explique servicos, politicas, argumentos comerciais, objeccoes ou respostas prontas."
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#111111] px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
                  />
                </label>

                <label className="block text-xs uppercase tracking-[0.16em] text-white/45">
                  Tags
                  <input
                    value={form.tags}
                    onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                    placeholder="faq, preco, urgencia, agendamento"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#111111] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent)]/10 px-4 py-2.5 text-sm font-medium text-[var(--cliente-accent)] transition hover:bg-[var(--cliente-accent)]/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editingDocId ? "Atualizar" : "Salvar documento"}
                  </button>
                  {editingDocId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/76 transition hover:bg-white/[0.08]"
                    >
                      Cancelar edicao
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <EmptyState
                title="Permissao insuficiente"
                description="Sua conta nao possui a capacidade necessaria para editar a base de conhecimento deste tenant."
              />
            )}
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <SectionHeader title="Templates rapidos" subtitle="Pontos de partida para acelerar a curadoria da base." />
            <div className="space-y-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="w-full rounded-2xl border border-white/10 bg-black/25 p-3 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{template.title}</p>
                      <p className="mt-1 text-xs text-white/46">{template.tags}</p>
                    </div>
                    <StateBadge label={typeLabel(template.type)} tone={typeTone(template.type)} />
                  </div>
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <SectionHeader title="Uso pela IA" subtitle="Quais documentos estao influenciando mais respostas reais." />
            <div className="space-y-3">
              {usageRows.length ? (
                usageRows.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{item.preview || "Documento sem preview"}</p>
                        <p className="mt-1 text-xs text-white/46">{typeLabel(item.type)}</p>
                      </div>
                      <StateBadge label={`${item.total} usos`} tone={usageTone(item.total)} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="Sem uso recente" description="Quando a IA consultar documentos, a leitura aparece aqui." />
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <SectionHeader title="Gatilhos de escalada" subtitle="Assuntos que ainda estao levando a handoff humano." />
            <div className="space-y-3">
              {topReasons.length ? (
                topReasons.map((item) => (
                  <div key={item.reason} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-white/84">{item.reason}</p>
                      <StateBadge label={String(item.total)} tone="warning" />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="Sem escaladas recentes" description="Bom sinal: o agente nao precisou escalar conversas recentemente." />
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <SectionHeader title="Playbook rapido" subtitle="Aja no modulo certo a partir do conhecimento." />
            <div className="space-y-3">
              <QuickLink href="/cliente/painel/ia?risk=low_confidence" title="Revisar confianca da IA" description="Cruzar documentos sem uso com logs de baixa confianca do agente." />
              <QuickLink href="/cliente/painel/handoffs" title="Ler escaladas humanas" description="Usar motivos de handoff para decidir quais docs ou politicas precisam entrar na base." />
              <QuickLink href="/cliente/painel/logs?ai=handoff" title="Auditar decisao do agente" description="Entender em quais conversas a base ainda nao sustentou a resposta automatica." />
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-xs text-white/45">
      <span className="block uppercase tracking-[0.16em]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#111111] text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-white/10 bg-black/25 p-3 transition hover:bg-white/[0.04]"
    >
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs text-white/48">{description}</p>
    </Link>
  );
}

