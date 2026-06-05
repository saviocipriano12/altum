"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  FileText,
  HelpCircle,
  Loader2,
  PencilLine,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  ClientActionButton,
  ClientTabs,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

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

type FormState = {
  type: "faq" | "policy";
  area: string;
  title: string;
  content: string;
  tags: string;
};

const EMPTY_FORM: FormState = {
  type: "faq",
  area: "Atendimento",
  title: "",
  content: "",
  tags: "",
};

const AREAS = ["Todos", "Atendimento", "Comercial", "Entrega", "Pagamento", "Politicas", "FAQ", "Documentos"] as const;

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
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
  if (typeof value === "number") return new Date(value);
  return null;
}

function formatDate(value: unknown) {
  const date = toDate(value);
  if (!date) return "sem data";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function parseTags(value: string) {
  return value
    .split(/,|\n|;|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function areaFromDoc(doc: KbDoc) {
  const areaTag = (doc.tags || []).find((tag) => tag.toLowerCase().startsWith("area:"));
  if (!areaTag) {
    if (doc.type === "policy") return "Politicas";
    if (doc.type === "catalog") return "Comercial";
    return "FAQ";
  }
  return areaTag.slice("area:".length).trim() || "FAQ";
}

function titleFromDoc(doc: KbDoc) {
  const firstLine = clean(doc.content.split("\n")[0], 120);
  if (firstLine.toLowerCase().startsWith("titulo:")) return firstLine.slice(7).trim() || "Conhecimento";
  if (doc.type === "catalog") return clean((doc as KbDoc & { productName?: string }).productName, 120) || "Produto ou servico";
  return firstLine || "Conhecimento";
}

function bodyFromDoc(doc: KbDoc) {
  const lines = doc.content.split("\n");
  if (lines[0]?.toLowerCase().startsWith("titulo:")) return lines.slice(1).join("\n").trim();
  return doc.content;
}

function typeLabel(type: KbDoc["type"]) {
  if (type === "catalog") return "produto/servico";
  if (type === "policy") return "politica";
  return "pergunta";
}

function typeTone(type: KbDoc["type"]) {
  if (type === "catalog") return "ai" as const;
  if (type === "policy") return "warning" as const;
  return "success" as const;
}

function buildContent(form: FormState) {
  return [`Titulo: ${form.title.trim()}`, form.content.trim()].filter(Boolean).join("\n\n");
}

function tagsFromForm(form: FormState) {
  return unique([`area:${form.area}`, form.type === "policy" ? "politica" : "faq", ...parseTags(form.tags)]);
}

export default function ClienteConhecimentoPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("Todos");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const canManage = hasCapability("manage_ai");

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);
      const [docsRes, logsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
      ]);
      const docsPayload = (await docsRes.json()) as { items?: KbDoc[]; error?: string };
      const logsPayload = (await logsRes.json()) as { items?: AiLog[]; error?: string };
      if (!docsRes.ok) throw new Error(docsPayload.error || "Falha ao carregar conhecimento.");
      if (!logsRes.ok) throw new Error(logsPayload.error || "Falha ao carregar uso da IA.");
      setDocs(docsPayload.items || []);
      setLogs(logsPayload.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar base de conhecimento.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const usageMap = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((log) => {
      (log.matchedKbDocIds || []).forEach((docId) => map.set(docId, (map.get(docId) || 0) + 1));
    });
    return map;
  }, [logs]);

  const stats = useMemo(() => {
    const faq = docs.filter((doc) => doc.type === "faq").length;
    const policies = docs.filter((doc) => doc.type === "policy").length;
    const catalog = docs.filter((doc) => doc.type === "catalog").length;
    const used = docs.filter((doc) => (usageMap.get(doc.id) || 0) > 0).length;
    const thin = docs.filter((doc) => doc.type !== "catalog" && clean(doc.content, 2000).length < 90).length;
    return { total: docs.length, faq, policies, catalog, used, thin };
  }, [docs, usageMap]);

  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return docs
      .filter((doc) => {
        const area = areaFromDoc(doc);
        if (areaFilter !== "Todos" && area !== areaFilter) return false;
        if (!term) return true;
        return `${titleFromDoc(doc)} ${doc.content} ${(doc.tags || []).join(" ")}`.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const usedDiff = (usageMap.get(b.id) || 0) - (usageMap.get(a.id) || 0);
        if (usedDiff !== 0) return usedDiff;
        return titleFromDoc(a).localeCompare(titleFromDoc(b), "pt-BR");
      });
  }, [areaFilter, docs, search, usageMap]);

  const topHandoff = useMemo(() => {
    const map = new Map<string, number>();
    logs
      .filter((log) => log.decision === "handoff")
      .forEach((log) => {
        const reason = clean(log.reason, 120) || "Sem motivo";
        map.set(reason, (map.get(reason) || 0) + 1);
      });
    return Array.from(map.entries())
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [logs]);

  async function submitDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;
    if (!form.title.trim() || !form.content.trim()) {
      setError("Preencha titulo e conteudo.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const endpoint = editingDocId
        ? `/api/tenant/${tenant.tenantId}/kb-docs/${editingDocId}`
        : `/api/tenant/${tenant.tenantId}/kb-docs`;
      const method = editingDocId ? "PATCH" : "POST";
      const res = await authedFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          content: buildContent(form),
          tags: tagsFromForm(form),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao salvar conhecimento.");

      setForm(EMPTY_FORM);
      setEditingDocId(null);
      setNotice(editingDocId ? "Conhecimento atualizado." : "Conhecimento adicionado.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar conhecimento.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(docId: string) {
    if (!tenant?.tenantId || !canManage) return;
    try {
      setBusyDocId(docId);
      setError(null);
      setNotice(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs/${docId}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao remover conhecimento.");
      if (editingDocId === docId) {
        setEditingDocId(null);
        setForm(EMPTY_FORM);
      }
      setNotice("Conhecimento removido.");
      await loadData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao remover conhecimento.");
    } finally {
      setBusyDocId(null);
    }
  }

  function startEdit(doc: KbDoc) {
    if (doc.type === "catalog") return;
    setEditingDocId(doc.id);
    setForm({
      type: doc.type === "policy" ? "policy" : "faq",
      area: areaFromDoc(doc),
      title: titleFromDoc(doc),
      content: bodyFromDoc(doc),
      tags: (doc.tags || []).filter((tag) => !tag.startsWith("area:") && tag !== "faq" && tag !== "politica").join(", "),
    });
    setNotice(null);
    setError(null);
  }

  function resetForm() {
    setEditingDocId(null);
    setForm(EMPTY_FORM);
    setNotice(null);
    setError(null);
  }

  function applyTemplate(template: Partial<FormState>) {
    setEditingDocId(null);
    setForm((current) => ({ ...current, ...template }));
    setNotice(null);
    setError(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text-soft)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="client-daily-page space-y-4">
      <SectionHeader
        title="Base do assistente"
        subtitle="Organize respostas, politicas e processos para o atendimento vender com mais clareza."
        action={
          <Link
            href="/cliente/painel/produtos-servicos"
            className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]"
          >
            Produtos & Servicos
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Conteudos" value={String(stats.total)} icon={FileText} trend={`${stats.used} usados pelo assistente`} tone="ai" />
        <MetricCard label="Perguntas" value={String(stats.faq)} icon={HelpCircle} trend="duvidas e respostas" tone="success" />
        <MetricCard label="Politicas" value={String(stats.policies)} icon={ShieldCheck} trend="regras da empresa" tone="warning" />
        <MetricCard label="Produtos" value={String(stats.catalog)} icon={Building2} trend="geridos em Produtos & Servicos" tone="brand" />
        <MetricCard label="Melhorar" value={String(stats.thin)} icon={CheckCircle2} trend="conteudos curtos demais" tone={stats.thin ? "warning" : "success"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Biblioteca" subtitle="Tudo que sustenta as respostas e decisoes comerciais do Assistente Altum." />
            <ClientTabs
              value={areaFilter}
              onChange={setAreaFilter}
              items={AREAS.map((area) => ({ value: area, label: area }))}
            />
          </div>

          <label className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-sm text-[var(--cliente-card-text-muted)]">
            <Search className="h-4 w-4 text-[var(--cliente-primary)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por assunto, tag ou conteudo"
              className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
            />
          </label>

          <div className="mt-4 space-y-3">
            {filteredDocs.length ? (
              filteredDocs.map((doc) => {
                const totalUsage = usageMap.get(doc.id) || 0;
                const isCatalog = doc.type === "catalog";
                return (
                  <article key={doc.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StateBadge label={areaFromDoc(doc)} tone="neutral" />
                          <StateBadge label={typeLabel(doc.type)} tone={typeTone(doc.type)} />
                          <StateBadge label={`${totalUsage} usos`} tone={totalUsage ? "success" : "neutral"} />
                          <StateBadge label={`atualizado ${formatDate(doc.updatedAt || doc.createdAt)}`} tone="neutral" />
                        </div>
                        <h3 className="mt-3 text-lg font-semibold tracking-normal text-[var(--cliente-card-text)]">{titleFromDoc(doc)}</h3>
                        <p className="mt-2 line-clamp-4 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{bodyFromDoc(doc)}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(doc.tags || []).filter((tag) => !tag.startsWith("area:")).slice(0, 8).map((tag) => (
                            <StateBadge key={`${doc.id}_${tag}`} label={tag} tone="neutral" />
                          ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {isCatalog ? (
                          <Link
                            href="/cliente/painel/produtos-servicos"
                            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)]"
                          >
                            Editar oferta
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : null}
                        {canManage && !isCatalog ? (
                          <button
                            type="button"
                            onClick={() => startEdit(doc)}
                            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)]"
                          >
                            <PencilLine className="h-4 w-4" />
                            Editar
                          </button>
                        ) : null}
                        {canManage && !isCatalog ? (
                          <button
                            type="button"
                            disabled={busyDocId === doc.id}
                            onClick={() => void removeDoc(doc.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/15 disabled:opacity-60 dark:text-rose-100"
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
              <EmptyState title="Nenhum conteudo encontrado" description="Adicione respostas, politicas ou processos para melhorar a seguranca do atendimento." />
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5 md:p-6">
            <SectionHeader
              title={editingDocId ? "Editar conhecimento" : "Adicionar conhecimento"}
              subtitle="Escreva de forma clara, como a equipe explicaria para um cliente."
            />

            {error ? (
              <p className="mb-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-100">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-100">
                {notice}
              </p>
            ) : null}

            {canManage ? (
              <form onSubmit={submitDoc} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldSelect
                    label="Tipo"
                    value={form.type}
                    onChange={(value) => setForm((current) => ({ ...current, type: value as "faq" | "policy" }))}
                    options={[
                      { value: "faq", label: "Pergunta frequente" },
                      { value: "policy", label: "Politica ou regra" },
                    ]}
                  />
                  <FieldSelect
                    label="Area"
                    value={form.area}
                    onChange={(value) => setForm((current) => ({ ...current, area: value }))}
                    options={AREAS.filter((area) => area !== "Todos").map((area) => ({ value: area, label: area }))}
                  />
                </div>
                <FieldInput label="Titulo" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Ex: Como explicamos prazo de entrega" />
                <FieldTextArea label="Conteudo" value={form.content} onChange={(value) => setForm((current) => ({ ...current, content: value }))} placeholder="Resposta, politica, processo ou regra que o assistente deve seguir." />
                <FieldInput label="Tags" value={form.tags} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} placeholder="preco, garantia, prazo" />

                <div className="flex flex-wrap justify-end gap-2">
                  {editingDocId ? (
                    <ClientActionButton type="button" tone="secondary" onClick={resetForm}>
                      Cancelar
                    </ClientActionButton>
                  ) : null}
                  <ClientActionButton type="submit" tone="primary" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editingDocId ? "Atualizar" : "Salvar"}
                  </ClientActionButton>
                </div>
              </form>
            ) : (
              <EmptyState title="Somente leitura" description="Sua conta pode consultar a base, mas nao editar conhecimento." />
            )}
          </PanelCard>

          <PanelCard tone="ai" className="p-5">
            <CardTitle title="Modelos uteis" subtitle="Pontos de partida para tirar a base do improviso." />
            <div className="mt-4 space-y-2">
              <TemplateButton
                title="Pergunta sobre preco"
                onClick={() =>
                  applyTemplate({
                    type: "faq",
                    area: "Comercial",
                    title: "Como responder quando perguntam preco",
                    content: "Explique a faixa de investimento, valide o contexto do cliente e direcione para a melhor proxima acao sem pressionar.",
                    tags: "preco, comercial, objeção",
                  })
                }
              />
              <TemplateButton
                title="Politica de troca ou garantia"
                onClick={() =>
                  applyTemplate({
                    type: "policy",
                    area: "Politicas",
                    title: "Politica de troca e garantia",
                    content: "Descreva prazos, condicoes, excecoes e quando a IA deve chamar uma pessoa da equipe.",
                    tags: "troca, garantia, atendimento",
                  })
                }
              />
              <TemplateButton
                title="Processo de entrega"
                onClick={() =>
                  applyTemplate({
                    type: "policy",
                    area: "Entrega",
                    title: "Como explicamos prazos de entrega",
                    content: "Explique como o prazo e calculado, o que pode atrasar e quais informacoes o cliente precisa enviar.",
                    tags: "prazo, entrega, pos-venda",
                  })
                }
              />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Escaladas que pedem conteudo" subtitle="Use estes sinais para criar respostas ou politicas novas." />
            <div className="mt-4 space-y-2">
              {topHandoff.length ? (
                topHandoff.map((item) => (
                  <div key={item.reason} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                    <p className="text-sm text-[var(--cliente-card-text-muted)]">{item.reason}</p>
                    <StateBadge label={`${item.total}x`} tone="warning" />
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--cliente-card-text-muted)]">Ainda nao ha escaladas suficientes para sugerir novos conteudos.</p>
              )}
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="client-input mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none placeholder:text-[var(--cliente-card-text-soft)]"
      />
    </label>
  );
}

function FieldTextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={7}
        placeholder={placeholder}
        className="client-input mt-2 w-full resize-y rounded-xl border px-3 py-2.5 text-sm font-normal normal-case leading-6 tracking-normal outline-none placeholder:text-[var(--cliente-card-text-soft)]"
      />
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="client-input mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TemplateButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 text-left text-sm font-semibold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
    >
      <span className="inline-flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--cliente-ai)]" />
        {title}
      </span>
    </button>
  );
}
